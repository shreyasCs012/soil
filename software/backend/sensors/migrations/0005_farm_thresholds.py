from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sensors', '0004_farm_lat_lng'),
    ]

    operations = [
        migrations.AddField(
            model_name='farm',
            name='humidity_threshold',
            field=models.FloatField(
                default=75.0,
                help_text='Humidity % above which the water pump alert fires.',
            ),
        ),
        migrations.AddField(
            model_name='farm',
            name='temperature_threshold',
            field=models.FloatField(
                default=35.0,
                help_text='Temperature °C above which the water pump alert fires.',
            ),
        ),
        migrations.AddField(
            model_name='farm',
            name='moisture_threshold',
            field=models.FloatField(
                default=35.0,
                help_text='Soil moisture % below which a low-moisture alert fires.',
            ),
        ),
        migrations.AddField(
            model_name='farm',
            name='ph_min',
            field=models.FloatField(
                default=6.2,
                help_text='pH below this value triggers a pH-drift alert.',
            ),
        ),
        migrations.AddField(
            model_name='farm',
            name='ph_max',
            field=models.FloatField(
                default=7.4,
                help_text='pH above this value triggers a pH-drift alert.',
            ),
        ),
    ]
